import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CollapsibleSection from '../components/common/CollapsibleSection'
import MathFormula, { MathInline } from '../components/common/MathFormula'
import StudyBackButton from '../components/common/StudyBackButton'
import { getStudyLessonById, getStudySubjectById } from '../constants/studyMe/content'
import useAppStore from '../hooks/useAppStore'
import { getLessonState, markLessonOpened, setLessonStatus } from '../services/studyProgress'
import { fireAndForgetStudyMeEvent } from '../services/studyMeAnalytics'
import {
  fetchStudyMeImportance,
  toggleStudyMeLessonImportant,
  toggleStudyMeTopicImportant,
} from '../services/studyMeImportance'
import { shouldRenderAsMath } from '../utils/mathLatex'

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

function normalizeDefinitionEntries(definitions) {
  if (!Array.isArray(definitions)) {
    return []
  }

  return definitions
    .map((item) => {
      if (typeof item === 'string') {
        return { term: '', description: item }
      }

      return {
        term: String(item?.term || '').trim(),
        description: String(item?.description || item?.desc || '').trim(),
      }
    })
    .filter((item) => item.term || item.description)
}

function normalizeListItems(values) {
  return Array.isArray(values) ? values.filter((item) => String(item || '').trim()) : []
}

function TopicStudyGuide({ topic }) {
  const definitions = normalizeDefinitionEntries(topic?.definitions)
  const keyConcepts = normalizeListItems(topic?.keyConcepts)
  const useCases = normalizeListItems(topic?.useCases)
  const examples = normalizeListItems(topic?.examples)
  const standardReferences = normalizeListItems(topic?.standardReferences)
  const comparisonTable = topic?.comparisonTable
  const hasGuideContent =
    Boolean(String(topic?.analogy || '').trim()) ||
    Boolean(String(topic?.standardDefinition || '').trim()) ||
    definitions.length > 0 ||
    keyConcepts.length > 0 ||
    useCases.length > 0 ||
    examples.length > 0 ||
    standardReferences.length > 0 ||
    (Array.isArray(comparisonTable?.headers) && comparisonTable.headers.length && Array.isArray(comparisonTable?.rows) && comparisonTable.rows.length)

  if (!hasGuideContent) {
    return null
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-[#A8D8FF]/15 bg-[#2C2348]/80 p-3">
      <div className="flex flex-wrap gap-2">
        {topic.analogy ? (
          <div className="rounded-xl border border-[#E2BC8B]/25 bg-[#E2BC8B]/10 px-3 py-2 text-xs leading-relaxed text-[#F5DEBE] break-words">
            <span className="font-semibold text-[#F2CA98]">Analogy:</span> {topic.analogy}
          </div>
        ) : null}
        {topic.standardDefinition ? (
          <div className="rounded-xl border border-[#A8F5C5]/25 bg-[#A8F5C5]/10 px-3 py-2 text-xs leading-relaxed text-[#DBFCEA] break-words">
            <span className="font-semibold text-[#A8F5C5]">Standard Reference:</span> {topic.standardDefinition}
          </div>
        ) : null}
      </div>

      {definitions.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Definitions</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {definitions.map((item, index) => (
              <div key={`${topic.id}-definition-${index}`} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-[#D8D3E8]">
                {item.term ? <p className="font-semibold text-[#F4F1FF]">{item.term}</p> : null}
                <p className={item.term ? 'mt-1 leading-relaxed' : 'leading-relaxed'}>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {keyConcepts.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Key Concepts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {keyConcepts.map((item) => (
              <span key={`${topic.id}-concept-${item}`} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-[#E7DEDE]">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {Array.isArray(comparisonTable?.headers) && comparisonTable.headers.length && Array.isArray(comparisonTable?.rows) && comparisonTable.rows.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">
            {comparisonTable.title || 'Comparison'}
          </p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-[#241C45]">
            <table className="min-w-full text-left text-xs text-[#E7DEDE]">
              <thead className="bg-[#3A315D] text-[#F4F1FF]">
                <tr>
                  {comparisonTable.headers.map((header) => (
                    <th key={`${topic.id}-header-${header}`} className="px-3 py-2 font-semibold whitespace-normal break-words sm:whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonTable.rows.map((row, rowIndex) => (
                  <tr key={`${topic.id}-row-${rowIndex}`} className="border-t border-white/10 even:bg-white/5">
                    {row.map((cell, cellIndex) => (
                      <td key={`${topic.id}-${rowIndex}-${cellIndex}`} className="px-3 py-2 whitespace-normal break-words sm:whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {useCases.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Use Cases</p>
          <ul className="mt-2 grid gap-1.5 text-xs text-[#D8D3E8] sm:grid-cols-2">
            {useCases.map((item) => (
              <li key={`${topic.id}-use-${item}`} className="rounded-lg bg-white/5 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {examples.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Examples</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs text-[#CFE8FF]">
            {examples.map((item) => (
              <li key={`${topic.id}-example-${item}`} className="rounded-full border border-[#A8D8FF]/25 bg-[#A8D8FF]/10 px-2.5 py-1">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {standardReferences.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Standard References</p>
          <ul className="mt-2 space-y-1.5 text-xs text-[#D8D3E8]">
            {standardReferences.map((item) => (
              <li key={`${topic.id}-standard-${item}`} className="rounded-lg bg-white/5 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function NotationList({ entries }) {
  return (
    <dl className="space-y-1.5 text-xs text-[#D8D3E8]">
      {entries.map(([symbol, meaning]) => (
        <div key={symbol} className="grid grid-cols-[auto,1fr] items-start gap-2">
          <dt className="pt-0.5 text-[#F2CA98]">
            {shouldRenderAsMath(symbol) ? (
              <MathInline latex={symbol} fallbackText={symbol} className="font-semibold" />
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
  const isTheorySubject = subject?.contentType === 'theory'
  const formulas = getFormulaNames(lesson)
  const topics = Array.isArray(lesson.topics) ? lesson.topics.map((topic) => topic.title).filter(Boolean) : []
  const numberedTopics = topics.length
    ? topics.map((topic, index) => `${index + 1}. ${topic}`).join('\n')
    : '1. Explain the lesson in logical exam-relevant sections.'

  if (isTheorySubject) {
    return [
      'Act as an exam-focused tutor for a BBA 2nd year student.',
      '',
      'Study context:',
      `- Subject: ${subject.title}`,
      `- Lesson ${lesson.lessonNumber}: ${lesson.title}`,
      `- Scope: ${lesson.covers}`,
      '',
      'Teach the entire lesson topic-by-topic using this exact topic order:',
      numberedTopics,
      '',
      'For each topic, strictly follow this structure:',
      '1) Concept explanation',
      '- Explain the concept in simple words first.',
      '- Then give a slightly deeper explanation in clear and exam-friendly language.',
      '2) Definitions and terminology',
      '- Define important terms properly.',
      '- Highlight keywords students can use in exam answers.',
      '3) Key points',
      '- List the most important points to remember.',
      '4) Examples and applications',
      '- Add practical examples wherever relevant.',
      '- Use student-friendly or real-world examples if possible.',
      '5) Comparisons/differences',
      '- Add clear comparisons where concepts are commonly confused, such as model vs model or approach vs approach.',
      '6) Revision summary',
      '- End with a compact revision list for last-minute preparation.',
      '',
      'Tone and style rules:',
      '- Keep the tone simple but informative.',
      '- Focus on concepts, definitions, comparisons, and understanding.',
      '- Avoid heavy numerical or formula-based teaching unless the lesson explicitly needs it.',
      '- Use clean headings and readable formatting.',
    ].join('\n')
  }

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
  const isTheorySubject = subject?.contentType === 'theory'
  const subtopics = Array.isArray(topic?.subtopics) ? topic.subtopics.filter(Boolean) : []
  const numberedSubtopics = subtopics.length
    ? subtopics.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '1. Explain the core ideas from this topic.'

  if (isTheorySubject) {
    return [
      'Act as an exam-focused tutor for a BBA 2nd year student.',
      '',
      'Goal: Help the student learn this topic quickly and clearly for revision.',
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
      '- Explain each subtopic one by one in simple words.',
      '- Keep the explanation short, clear, and exam-focused.',
      '2) Key definitions',
      '- Define the most important terms in simple language.',
      '3) Key points for revision',
      '- List the most important revision points in short bullets.',
      '- Add simple examples where helpful.',
      '- Add comparisons only if they are relevant to understanding the topic.',
      '',
      'Tone and style:',
      '- Simple but informative.',
      '- Theory-focused and easy to revise quickly.',
      '- Avoid unnecessary length.',
      '- Keep formatting clean and readable.',
    ].join('\n')
  }

  return [
    'Act as an exam-focused tutor for a BBA 2nd year student.',
    '',
    'Goal: Help the student learn this topic quickly and revise it easily.',
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
    '- Keep it simple, clear, and exam-focused.',
    '2) Key definitions',
    '- Define the most important terms or formula-related words if needed.',
    '3) Key points for revision',
    '- List the most important points to remember in short bullets.',
    '- Add a simple example or comparison only if it helps understanding.',
      '',
      'Tone and style:',
      '- Simple but informative.',
      '- Exam-focused and quick to revise.',
      '- Avoid unnecessary length.',
      '- Keep formatting clean and readable.',
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
  const [openTopicId, setOpenTopicId] = useState(null)
  const [mobileNotationOpenById, setMobileNotationOpenById] = useState({})
  const [lessonImportance, setLessonImportance] = useState(null)
  const [topicImportanceById, setTopicImportanceById] = useState({})
  const [importanceStatus, setImportanceStatus] = useState('idle')
  const [importanceFeedback, setImportanceFeedback] = useState('')
  const [isTogglingLessonImportance, setIsTogglingLessonImportance] = useState(false)
  const [togglingTopicId, setTogglingTopicId] = useState('')

  useEffect(() => {
    setLessonState(getLessonState(subjectId, lessonId))
  }, [lessonId, subjectId])

  useEffect(() => {
    if (!subject?.id || !lesson?.id || !session.token) {
      setLessonImportance(null)
      setTopicImportanceById({})
      setImportanceStatus(session.token ? 'idle' : 'unauthenticated')
      return
    }

    let isCancelled = false
    setImportanceStatus('loading')

    fetchStudyMeImportance({
      token: session.token,
      subjectId: subject.id,
      lessonIds: [lesson.id],
      topicIds: Array.isArray(lesson.topics) ? lesson.topics.map((topic) => topic.id) : [],
    })
      .then((data) => {
        if (isCancelled) {
          return
        }

        setLessonImportance(data?.lessons?.[lesson.id] || { important: false, importantCount: 0, importantBadge: null })
        setTopicImportanceById(data?.topics && typeof data.topics === 'object' ? data.topics : {})
        setImportanceStatus('success')
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        setLessonImportance(null)
        setTopicImportanceById({})
        setImportanceStatus('error')
      })

    return () => {
      isCancelled = true
    }
  }, [lesson?.id, lesson?.topics, session.token, subject?.id])

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
  const shouldShowFormulaSection = subject?.contentType !== 'theory'
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

  const handleLessonImportantToggle = async () => {
    if (!session.token) {
      setImportanceFeedback('Sign in to use community importance.')
      window.setTimeout(() => setImportanceFeedback(''), 2200)
      navigate('/login')
      return
    }

    if (isTogglingLessonImportance) {
      return
    }

    setIsTogglingLessonImportance(true)
    setImportanceFeedback('')

    try {
      const data = await toggleStudyMeLessonImportant({
        token: session.token,
        subjectId: subject.id,
        subjectName: subject.title,
        lessonId: lesson.id,
        lessonName: lesson.title,
      })

      setLessonImportance({
        important: Boolean(data?.important),
        importantCount: Number(data?.importantCount || 0),
        importantBadge: data?.importantBadge || null,
      })

      fireAndForgetStudyMeEvent({
        eventType: 'studyme_lesson_important_toggled',
        token: session.token,
        userName: user.portalName || user.name || user.rollNumber || user.id,
        subjectName: subject.title,
        lessonName: lesson.title,
      })
    } catch {
      setImportanceFeedback('Unable to update importance right now.')
      window.setTimeout(() => setImportanceFeedback(''), 2200)
    } finally {
      setIsTogglingLessonImportance(false)
    }
  }

  const handleTopicImportantToggle = async (topic) => {
    if (!session.token) {
      setTopicCopyFeedback({ id: topic.id, message: 'Sign in required' })
      window.setTimeout(() => setTopicCopyFeedback({ id: '', message: '' }), 1800)
      navigate('/login')
      return
    }

    if (togglingTopicId) {
      return
    }

    setTogglingTopicId(topic.id)
    setTopicCopyFeedback({ id: '', message: '' })

    try {
      const data = await toggleStudyMeTopicImportant({
        token: session.token,
        subjectId: subject.id,
        subjectName: subject.title,
        lessonId: lesson.id,
        lessonName: lesson.title,
        topicId: topic.id,
        topicName: topic.title,
      })

      setTopicImportanceById((current) => ({
        ...current,
        [topic.id]: {
          important: Boolean(data?.important),
          importantCount: Number(data?.importantCount || 0),
          importantBadge: data?.importantBadge || null,
        },
      }))

      fireAndForgetStudyMeEvent({
        eventType: 'studyme_topic_important_toggled',
        token: session.token,
        userName: user.portalName || user.name || user.rollNumber || user.id,
        subjectName: subject.title,
        lessonName: lesson.title,
        topicName: topic.title,
      })
    } catch {
      setTopicCopyFeedback({ id: topic.id, message: 'Importance unavailable' })
      window.setTimeout(() => setTopicCopyFeedback({ id: '', message: '' }), 1800)
    } finally {
      setTogglingTopicId('')
    }
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

  const toggleTopicDetails = (topicId) => {
    setOpenTopicId((current) => (current === topicId ? null : topicId))
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
            disabled={(importanceStatus !== 'success' && importanceStatus !== 'unauthenticated') || isTogglingLessonImportance}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              lessonImportance?.important
                ? 'border-[#E2BC8B]/70 bg-[#E2BC8B]/20 text-[#F2CA98]'
                : 'border-white/20 text-[#E7DEDE] hover:bg-white/10'
            }`}
          >
            {importanceStatus === 'unauthenticated'
              ? 'Sign in to mark important'
              : importanceStatus === 'loading'
              ? 'Loading importance...'
              : isTogglingLessonImportance
                ? 'Updating...'
                : lessonImportance?.important
                  ? 'Marked Important'
                  : 'Mark as Important'}
          </button>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
              lessonImportance?.important
                ? 'border-[#E2BC8B]/45 bg-[#E2BC8B]/12 text-[#F2CA98]'
                : 'border-white/20 bg-white/5 text-[#D8D3E8]'
            }`}
          >
            <span>
              {lessonImportance
                ? `${lessonImportance.importantCount} students marked this`
                : importanceStatus === 'loading'
                  ? 'Loading count...'
                  : importanceStatus === 'unauthenticated'
                    ? 'Sign in to view community importance'
                    : 'Importance unavailable'}
            </span>
            {lessonImportance?.importantBadge === 'hot' ? <span className="text-[#FFD2C2]">Hot</span> : null}
          </span>
          {importanceFeedback ? <span className="self-center text-xs text-[#FFD2C2]">{importanceFeedback}</span> : null}
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
        {shouldShowFormulaSection ? (
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
                          <MathFormula
                            latex={formula.latex}
                            fallbackText={formula.formula}
                            className="mt-2"
                          />

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
        ) : null}

        <CollapsibleSection
          title="Topics in this Lesson"
          subtitle={subject?.contentType === 'theory' ? 'Each topic is organized like a visual study guide with concepts, comparisons, and use cases.' : 'Each topic combines explanation and examples as they appear in the PDF.'}
          isExpanded={expandedSections.topics}
          onToggle={() => toggleSection('topics')}
        >
          {Array.isArray(lesson.topics) && lesson.topics.length ? (
            <div className="mt-2 space-y-2">
              {lesson.topics.map((topic) => {
                const subtopics = Array.isArray(topic.subtopics) ? topic.subtopics : []
                const hasPracticeProblems = topicPracticeMap.get(topic.id) === true
                const isExpanded = openTopicId === topic.id
                const topicImportance = topicImportanceById[topic.id] || null
                const topicChips = [
                  topicImportance ? `${topicImportance.importantCount} marked important` : '',
                  Array.isArray(topic.definitions) && topic.definitions.length ? 'Definitions' : '',
                  topic.comparisonTable?.rows?.length ? 'Comparison' : '',
                  Array.isArray(topic.useCases) && topic.useCases.length ? 'Use Cases' : '',
                  topic.analogy ? 'Analogy' : '',
                ].filter(Boolean)

                return (
                  <article
                    key={topic.id}
                    aria-expanded={isExpanded}
                    className={`rounded-xl border px-3 py-3 transition ${
                      topicImportance?.important
                        ? 'border-[#E2BC8B]/35 bg-[#3D315D]'
                        : isExpanded
                          ? 'border-[#A8D8FF]/30 bg-[#352A59] shadow-md'
                          : 'border-white/10 bg-[#3A315D] hover:bg-[#403668]'
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleTopicDetails(topic.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          toggleTopicDetails(topic.id)
                        }
                      }}
                      className="w-full cursor-pointer text-left"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#F4F1FF]">{topic.title}</p>
                          {!isExpanded && topic.summary ? <p className="mt-1 text-xs leading-relaxed text-[#D8D3E8]">{topic.summary}</p> : null}
                          {!isExpanded ? (
                            <p className="mt-1 text-xs text-[#D8D3E8]">
                              {subtopics.length} subtopics • Pages {topic.pageRange?.start || '-'} - {topic.pageRange?.end || '-'}
                            </p>
                          ) : null}
                        </div>

                        <span className="inline-flex self-start rounded-full border border-white/20 bg-[#312051] px-3 py-1.5 text-[11px] font-semibold text-[#E7DEDE] sm:shrink-0">
                          {isExpanded ? 'Hide details' : 'View details'}
                        </span>
                      </div>
                    </div>

                    {!isExpanded && topicChips.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {topicChips.map((chip) => (
                          <span
                            key={`${topic.id}-chip-${chip}`}
                            className={`rounded-full border px-2.5 py-1 text-[11px] ${
                              chip === `${topicImportance?.importantCount} marked important`
                                ? topicImportance?.important
                                  ? 'border-[#E2BC8B]/35 bg-[#E2BC8B]/12 text-[#F2CA98]'
                                  : 'border-white/15 bg-white/5 text-[#E7DEDE]'
                                : 'border-white/15 bg-white/5 text-[#E7DEDE]'
                            }`}
                          >
                            {chip}
                          </span>
                        ))}
                        {topicImportance?.importantBadge === 'hot' ? (
                          <span className="rounded-full border border-[#FF8A65]/40 bg-[#FF8A65]/12 px-2.5 py-1 text-[11px] text-[#FFD2C2]">
                            Hot topic
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {isExpanded ? (
                      <>
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleTopicImportantToggle(topic)
                            }}
                            disabled={(importanceStatus !== 'success' && importanceStatus !== 'unauthenticated') || togglingTopicId === topic.id}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              topicImportance?.important
                                ? 'border-[#E2BC8B]/70 bg-[#E2BC8B]/20 text-[#F2CA98]'
                                : 'border-white/20 bg-[#312051] text-[#E7DEDE] hover:bg-[#4A3E73]'
                            }`}
                          >
                            {importanceStatus === 'unauthenticated'
                              ? 'Sign in to mark important'
                              : importanceStatus !== 'success'
                                ? 'Importance unavailable'
                              : togglingTopicId === topic.id
                                ? 'Updating...'
                                : `${topicImportance?.important ? 'Marked Important' : 'Mark as Important'} • ${topicImportance?.importantCount ?? 0}`}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openTopicPdf(topic)
                            }}
                            className="rounded-full border border-[#A8D8FF]/50 bg-[#312051] px-3 py-1.5 text-xs font-semibold text-[#CFE8FF] hover:bg-[#4A3E73]"
                          >
                            Open in PDF
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleCopyTopicPrompt(topic)
                            }}
                            className="rounded-full border border-white/20 bg-[#312051] px-3 py-1.5 text-xs font-semibold text-[#E7DEDE] hover:bg-[#4A3E73]"
                          >
                            Copy Topic Prompt
                          </button>
                          {hasPracticeProblems ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                openTopicPractice(topic)
                              }}
                              className="rounded-full border border-[#E2BC8B]/45 bg-[#E2BC8B]/12 px-3 py-1.5 text-xs font-semibold text-[#F2CA98] hover:bg-[#E2BC8B]/20"
                            >
                              Practice Problems
                            </button>
                          ) : null}
                          {topicCopyFeedback.id === topic.id && topicCopyFeedback.message ? (
                            <span className="text-xs text-[#A8F5C5]">{topicCopyFeedback.message}</span>
                          ) : null}
                        </div>

                        {subtopics.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {subtopics.map((item) => (
                              <span key={`${topic.id}-${item}`} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-[#E7DEDE]">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {subject?.contentType === 'theory' ? <TopicStudyGuide topic={topic} /> : null}
                      </>
                    ) : null}
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
