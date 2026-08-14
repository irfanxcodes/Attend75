import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import CollapsibleSection from '../components/common/CollapsibleSection'
import MathFormula, { MathInline } from '../components/common/MathFormula'
import StudyBackButton from '../components/common/StudyBackButton'
import { getStudyLessonById, getStudySubjectById } from '../constants/studyMe/content'
import { hasLessonYoutubeLearning } from '../constants/studyMe/youtubeLearning'
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

function normalizeConceptEntries(concepts) {
  if (!Array.isArray(concepts)) {
    return []
  }

  return concepts
    .map((item) => {
      if (typeof item === 'string') {
        return { title: '', explanation: item }
      }

      return {
        title: String(item?.title || item?.name || '').trim(),
        explanation: String(item?.explanation || item?.description || '').trim(),
      }
    })
    .filter((item) => item.title || item.explanation)
}

function normalizeListItems(values) {
  return Array.isArray(values) ? values.filter((item) => String(item || '').trim()) : []
}

function normalizeKeyedList(values, key, labelKey) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      return {
        key: String(item[key] || item[labelKey] || '').trim(),
        description: String(item.explanation || item.description || item.purpose || '').trim(),
      }
    })
    .filter((item) => item?.key && item?.description)
}

function normalizeStudyGuideSections(sections) {
  if (!Array.isArray(sections)) {
    return []
  }

  return sections
    .map((section) => {
      if (!section || typeof section !== 'object') {
        return null
      }

      const title = String(section.title || '').trim()
      const description = String(section.description || '').trim()
      const layout = String(section.layout || '').trim()
      const items = Array.isArray(section.items) ? section.items : []
      const fields = Array.isArray(section.fields) ? section.fields : []

      const hasItems = items.some((item) => item && Object.values(item).some((value) => String(value || '').trim()))
      if (!title && !description && !hasItems) {
        return null
      }

      return {
        id: String(section.id || '').trim(),
        title,
        description,
        layout,
        items,
        fields,
      }
    })
    .filter(Boolean)
}

function buildLegacyStudyGuideSections(topic) {
  const legacySections = []

  const stepsInDecision = topic?.stepsInDecisionAnalysis
  const stepsTitle = String(stepsInDecision?.title || '').trim()
  const stepsDescription = String(stepsInDecision?.description || '').trim()
  const stepsItems = Array.isArray(stepsInDecision?.steps) ? stepsInDecision.steps : []
  if (stepsTitle || stepsDescription || stepsItems.length) {
    legacySections.push({
      id: 'legacy-steps-in-decision-analysis',
      layout: 'step-cards',
      title: stepsTitle || 'Steps In Decision Analysis',
      description: stepsDescription,
      items: stepsItems.map((step) => ({
        title: step?.step,
        description: step?.explanation,
        example: step?.example,
      })),
    })
  }

  const decisionEnvironments = topic?.decisionEnvironments
  const decisionTitle = String(decisionEnvironments?.title || '').trim()
  const decisionDescription = String(decisionEnvironments?.description || '').trim()
  const decisionItems = Array.isArray(decisionEnvironments?.types) ? decisionEnvironments.types : []
  if (decisionTitle || decisionDescription || decisionItems.length) {
    legacySections.push({
      id: 'legacy-decision-environments',
      layout: 'type-grid',
      title: decisionTitle || 'Decision Environments',
      description: decisionDescription,
      items: decisionItems.map((item) => ({
        label: item?.type || item?.title,
        description: item?.explanation || item?.description,
      })),
    })
  }

  const uncertaintyModels = topic?.uncertaintyModels
  const uncertaintyTitle = String(uncertaintyModels?.title || '').trim()
  const uncertaintyDescription = String(uncertaintyModels?.description || '').trim()
  const uncertaintyItems = Array.isArray(uncertaintyModels?.models) ? uncertaintyModels.models : []
  if (uncertaintyTitle || uncertaintyDescription || uncertaintyItems.length) {
    legacySections.push({
      id: 'legacy-uncertainty-models',
      layout: 'model-cards',
      title: uncertaintyTitle || 'Decision Models Under Uncertainty',
      description: uncertaintyDescription,
      fields: [
        { key: 'rule', label: 'Rule' },
        { key: 'logic', label: 'Logic' },
        { key: 'exampleTable', label: 'Example' },
        { key: 'example', label: 'Example' },
        { key: 'decision', label: 'Decision', tone: 'accent' },
      ],
      items: uncertaintyItems.map((model) => ({
        title: model?.name,
        rule: model?.rule,
        logic: model?.logic,
        exampleTable: model?.exampleTable,
        example: model?.example,
        decision: model?.decision,
      })),
    })
  }

  const riskModels = topic?.riskModels
  const riskTitle = String(riskModels?.title || '').trim()
  const riskDescription = String(riskModels?.description || '').trim()
  const riskItems = Array.isArray(riskModels?.models) ? riskModels.models : []
  if (riskTitle || riskDescription || riskItems.length) {
    legacySections.push({
      id: 'legacy-risk-models',
      layout: 'model-cards',
      title: riskTitle || 'Decision Models Under Risk',
      description: riskDescription,
      fields: [
        { key: 'explanation', label: '' },
        { key: 'formula', label: 'Formula' },
        { key: 'logic', label: 'Logic' },
        { key: 'example', label: 'Example', tone: 'accent' },
      ],
      items: riskItems.map((model) => ({
        title: model?.name,
        explanation: model?.explanation,
        formula: model?.formula,
        logic: model?.logic,
        example: model?.example,
      })),
    })
  }

  return legacySections
}

function DefinitionGrid({ title, topicId, entries }) {
  if (!entries.length) {
    return null
  }

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">{title}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {entries.map((item, index) => (
          <div key={`${topicId}-${title}-definition-${index}`} className="min-w-0 rounded-xl bg-white/5 px-3 py-2 text-xs text-[#D8D3E8]">
            {item.term ? <p className="font-semibold text-[#F4F1FF]">{item.term}</p> : null}
            <p className={item.term ? 'mt-1 break-words leading-relaxed' : 'break-words leading-relaxed'}>{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResponsiveComparisonTable({ topicId, comparisonTable }) {
  if (!Array.isArray(comparisonTable?.headers) || !comparisonTable.headers.length || !Array.isArray(comparisonTable?.rows) || !comparisonTable.rows.length) {
    return null
  }

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">
        {comparisonTable.title || 'Comparison'}
      </p>

      <div className="mt-2 space-y-2 sm:hidden">
        {comparisonTable.rows.map((row, rowIndex) => (
          <div key={`${topicId}-mobile-row-${rowIndex}`} className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#241C45] p-3 text-xs text-[#E7DEDE]">
            <dl className="space-y-2">
              {comparisonTable.headers.map((header, cellIndex) => (
                <div key={`${topicId}-mobile-cell-${rowIndex}-${cellIndex}`}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#CFC5E8]">{header}</dt>
                  <dd className="mt-0.5 whitespace-normal break-words leading-relaxed text-[#E7DEDE]">{row[cellIndex] || '-'}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-2 hidden max-w-full overflow-x-auto rounded-xl border border-white/10 bg-[#241C45] sm:block">
        <table className="min-w-full text-left text-xs text-[#E7DEDE]">
          <thead className="bg-[#3A315D] text-[#F4F1FF]">
            <tr>
              {comparisonTable.headers.map((header) => (
                <th key={`${topicId}-header-${header}`} className="px-3 py-2 font-semibold whitespace-normal break-words">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonTable.rows.map((row, rowIndex) => (
              <tr key={`${topicId}-row-${rowIndex}`} className="border-t border-white/10 even:bg-white/5">
                {row.map((cell, cellIndex) => (
                  <td key={`${topicId}-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top whitespace-normal break-words">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TopicStudyGuide({ topic }) {
  const summary = String(topic?.summary || '').trim()
  const details = String(topic?.details || '').trim()
  const asciiDiagram = String(topic?.asciiDiagram || '').trim()
  const theorySection = topic?.theorySection
  const theoryBrief = String(theorySection?.brief || '').trim()
  const theoryAlgorithm = String(theorySection?.hungarianAlgorithm || '').trim()
  const theorySteps = Array.isArray(theorySection?.executionSteps)
    ? theorySection.executionSteps.filter((step) => String(step || '').trim())
    : []
  const theoryCharacteristics = normalizeListItems(theorySection?.characteristics)
  const theoryPerformanceMeasures = normalizeListItems(theorySection?.performanceMeasures)
  const topicSteps = normalizeListItems(topic?.steps)
  const components = normalizeKeyedList(topic?.components, 'node', 'type')
  const foldingBackConcept = String(topic?.foldingBack?.concept || '').trim()
  const foldingBackAction = String(topic?.foldingBack?.action || '').trim()
  const definitions = normalizeDefinitionEntries(topic?.definitions)
  const notations = normalizeDefinitionEntries(topic?.notations)
  const concepts = normalizeConceptEntries(topic?.concepts)
  const majorJobAttitudes = normalizeDefinitionEntries(topic?.majorJobAttitudes)
  const keyConcepts = normalizeListItems(topic?.keyConcepts)
  const useCases = normalizeListItems(topic?.useCases)
  const examples = normalizeListItems(topic?.examples)
  const standardReferences = normalizeListItems(topic?.standardReferences)
  const comparisonTable = topic?.comparisonTable
  const studyGuideSections = normalizeStudyGuideSections(topic?.studyGuideSections)
  const legacyGuideSections = studyGuideSections.length ? [] : buildLegacyStudyGuideSections(topic)
  const guideSections = studyGuideSections.length ? studyGuideSections : legacyGuideSections
  const hasGuideContent =
    Boolean(summary) ||
    Boolean(details) ||
    Boolean(asciiDiagram) ||
    Boolean(theoryBrief) ||
    Boolean(theoryAlgorithm) ||
    theorySteps.length > 0 ||
    theoryCharacteristics.length > 0 ||
    theoryPerformanceMeasures.length > 0 ||
    topicSteps.length > 0 ||
    components.length > 0 ||
    Boolean(foldingBackConcept) ||
    Boolean(foldingBackAction) ||
    guideSections.length > 0 ||
    Boolean(String(topic?.analogy || '').trim()) ||
    Boolean(String(topic?.standardDefinition || '').trim()) ||
    definitions.length > 0 ||
    notations.length > 0 ||
    concepts.length > 0 ||
    majorJobAttitudes.length > 0 ||
    keyConcepts.length > 0 ||
    useCases.length > 0 ||
    examples.length > 0 ||
    standardReferences.length > 0 ||
    (Array.isArray(comparisonTable?.headers) && comparisonTable.headers.length && Array.isArray(comparisonTable?.rows) && comparisonTable.rows.length)

  if (!hasGuideContent) {
    return null
  }

  return (
    <div className="mt-3 min-w-0 max-w-full space-y-3 rounded-2xl border border-[#A8D8FF]/15 bg-[#2C2348]/80 p-2.5 sm:p-4">
      {summary ? (
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Summary</p>
          <p className="mt-1 break-words text-xs leading-relaxed text-[#E7DEDE]">{summary}</p>
        </div>
      ) : null}

      {details ? (
        <div className="min-w-0 rounded-xl border border-white/10 bg-[#241C45] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Detailed Explanation</p>
          <p className="mt-1 whitespace-pre-line break-words text-xs leading-relaxed text-[#D8D3E8]">{details}</p>
        </div>
      ) : null}

      {theoryBrief ? (
        <div className="min-w-0 rounded-xl border border-white/10 bg-[#241C45] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Theory Brief</p>
          <p className="mt-1 whitespace-pre-line break-words text-xs leading-relaxed text-[#D8D3E8]">{theoryBrief}</p>
        </div>
      ) : null}

      {theoryAlgorithm ? (
        <div className="min-w-0 rounded-xl border border-white/10 bg-[#241C45] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Algorithm Overview</p>
          <p className="mt-1 whitespace-pre-line break-words text-xs leading-relaxed text-[#D8D3E8]">{theoryAlgorithm}</p>
        </div>
      ) : null}

      {theoryCharacteristics.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Characteristics</p>
          <ul className="mt-2 grid gap-1.5 text-xs text-[#D8D3E8] sm:grid-cols-2">
            {theoryCharacteristics.map((item) => (
              <li key={`${topic.id}-theory-character-${item}`} className="min-w-0 break-words rounded-lg bg-white/5 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {theoryPerformanceMeasures.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Performance Measures</p>
          <ul className="mt-2 grid gap-1.5 text-xs text-[#D8D3E8] sm:grid-cols-2">
            {theoryPerformanceMeasures.map((item) => (
              <li key={`${topic.id}-theory-performance-${item}`} className="min-w-0 break-words rounded-lg bg-white/5 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {asciiDiagram ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Diagram</p>
          <pre className="mt-2 block w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl border border-[#A8D8FF]/20 bg-[#1F183B] px-2.5 py-3 font-mono text-[9px] leading-[1.4] text-[#CFE8FF] sm:px-3 sm:text-[11px]">
            <code className="block min-w-max whitespace-pre font-mono">{asciiDiagram}</code>
          </pre>
        </div>
      ) : null}

      <div className="min-w-0 flex flex-wrap gap-2">
        {topic.analogy ? (
          <div className="min-w-0 rounded-xl border border-[#E2BC8B]/25 bg-[#E2BC8B]/10 px-3 py-2 text-xs leading-relaxed text-[#F5DEBE] break-words">
            <span className="font-semibold text-[#F2CA98]">Analogy:</span> {topic.analogy}
          </div>
        ) : null}
        {topic.standardDefinition ? (
          <div className="min-w-0 rounded-xl border border-[#A8F5C5]/25 bg-[#A8F5C5]/10 px-3 py-2 text-xs leading-relaxed text-[#DBFCEA] break-words">
            <span className="font-semibold text-[#A8F5C5]">Standard Reference:</span> {topic.standardDefinition}
          </div>
        ) : null}
      </div>

      <DefinitionGrid title="Definitions" topicId={topic.id} entries={definitions} />

      <DefinitionGrid title="Notations" topicId={topic.id} entries={notations} />

      {concepts.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Concepts</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {concepts.map((concept, index) => (
              <div key={`${topic.id}-concept-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#D8D3E8]">
                {concept.title ? <p className="font-semibold text-[#F4F1FF]">{concept.title}</p> : null}
                {concept.explanation ? (
                  <p className={concept.title ? 'mt-1 break-words leading-relaxed' : 'break-words leading-relaxed'}>
                    {concept.explanation}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {guideSections.map((section) => {
        if (section.layout === 'step-cards') {
          const cards = Array.isArray(section.items)
            ? section.items
                .map((item) => ({
                  title: String(item?.title || '').trim(),
                  description: String(item?.description || '').trim(),
                  example: String(item?.example || '').trim(),
                }))
                .filter((item) => item.title || item.description || item.example)
            : []

          if (!section.title && !section.description && !cards.length) {
            return null
          }

          return (
            <div key={`${topic.id}-guide-${section.id || section.title}`} className="min-w-0 rounded-xl border border-white/10 bg-[#241C45] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">
                {section.title || 'Steps'}
              </p>
              {section.description ? (
                <p className="mt-1 text-xs leading-relaxed text-[#D8D3E8]">{section.description}</p>
              ) : null}
              {cards.length ? (
                <div className="mt-2 grid gap-2">
                  {cards.map((item, index) => (
                    <div key={`${topic.id}-guide-step-${index}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#D8D3E8]">
                      {item.title ? <p className="font-semibold text-[#F4F1FF]">{item.title}</p> : null}
                      {item.description ? <p className="mt-1 leading-relaxed">{item.description}</p> : null}
                      {item.example ? <p className="mt-1 text-[#CFE8FF]">Example: {item.example}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }

        if (section.layout === 'type-grid') {
          const gridItems = Array.isArray(section.items)
            ? section.items
                .map((item) => ({
                  label: String(item?.label || '').trim(),
                  description: String(item?.description || '').trim(),
                }))
                .filter((item) => item.label && item.description)
            : []

          if (!section.title && !section.description && !gridItems.length) {
            return null
          }

          return (
            <div key={`${topic.id}-guide-${section.id || section.title}`} className="min-w-0 rounded-xl border border-white/10 bg-[#241C45] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">
                {section.title || 'Environments'}
              </p>
              {section.description ? (
                <p className="mt-1 text-xs leading-relaxed text-[#D8D3E8]">{section.description}</p>
              ) : null}
              {gridItems.length ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {gridItems.map((item, index) => (
                    <div key={`${topic.id}-guide-env-${index}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#D8D3E8]">
                      <p className="font-semibold text-[#F4F1FF]">{item.label}</p>
                      <p className="mt-1 leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }

        if (section.layout === 'model-cards') {
          const modelItems = Array.isArray(section.items) ? section.items : []
          const fields = Array.isArray(section.fields) ? section.fields : []

          if (!section.title && !section.description && !modelItems.length) {
            return null
          }

          return (
            <div key={`${topic.id}-guide-${section.id || section.title}`} className="min-w-0 rounded-xl border border-white/10 bg-[#241C45] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">
                {section.title || 'Models'}
              </p>
              {section.description ? (
                <p className="mt-1 text-xs leading-relaxed text-[#D8D3E8]">{section.description}</p>
              ) : null}
              {modelItems.length ? (
                <div className="mt-2 grid gap-2">
                  {modelItems.map((model, index) => (
                    <div key={`${topic.id}-guide-model-${index}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#D8D3E8]">
                      {model.title ? <p className="font-semibold text-[#F4F1FF]">{String(model.title).trim()}</p> : null}
                      {fields.length
                        ? fields.map((field) => {
                            const value = String(model?.[field.key] || '').trim()
                            if (!value) {
                              return null
                            }
                            const isAccent = field.tone === 'accent'
                            const className = isAccent ? 'mt-1 text-[#CFE8FF]' : 'mt-1 leading-relaxed'
                            return (
                              <p key={`${topic.id}-guide-field-${index}-${field.key}`} className={className}>
                                {field.label ? `${field.label}: ` : ''}{value}
                              </p>
                            )
                          })
                        : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }

        return null
      })}

      {components.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Decision Tree Components</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {components.map((item, index) => (
              <div key={`${topic.id}-component-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#D8D3E8]">
                <p className="font-semibold text-[#F4F1FF]">{item.key}</p>
                <p className="mt-1 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {topicSteps.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Process Steps</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[#D8D3E8]">
            {topicSteps.map((step, index) => (
              <li key={`${topic.id}-topic-step-${index}`}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {foldingBackConcept || foldingBackAction ? (
        <div className="min-w-0 rounded-xl border border-white/10 bg-[#241C45] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Folding Back</p>
          {foldingBackConcept ? (
            <p className="mt-1 text-xs leading-relaxed text-[#D8D3E8]">{foldingBackConcept}</p>
          ) : null}
          {foldingBackAction ? (
            <p className="mt-2 text-xs leading-relaxed text-[#CFE8FF]">{foldingBackAction}</p>
          ) : null}
        </div>
      ) : null}

      {theorySteps.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Execution Steps</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[#D8D3E8]">
            {theorySteps.map((step, index) => (
              <li key={`${topic.id}-theory-step-${index}`}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <DefinitionGrid title="Structured Points" topicId={topic.id} entries={majorJobAttitudes} />

      {keyConcepts.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Key Concepts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {keyConcepts.map((item) => (
              <span key={`${topic.id}-concept-${item}`} className="max-w-full break-words rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-[#E7DEDE]">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <ResponsiveComparisonTable topicId={topic.id} comparisonTable={comparisonTable} />

      {useCases.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Use Cases</p>
          <ul className="mt-2 grid gap-1.5 text-xs text-[#D8D3E8] sm:grid-cols-2">
            {useCases.map((item) => (
              <li key={`${topic.id}-use-${item}`} className="min-w-0 break-words rounded-lg bg-white/5 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {examples.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Examples</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs text-[#CFE8FF]">
            {examples.map((item) => (
              <li key={`${topic.id}-example-${item}`} className="max-w-full break-words rounded-full border border-[#A8D8FF]/25 bg-[#A8D8FF]/10 px-2.5 py-1">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {standardReferences.length ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Standard References</p>
          <ul className="mt-2 space-y-1.5 text-xs text-[#D8D3E8]">
            {standardReferences.map((item) => (
              <li key={`${topic.id}-standard-${item}`} className="min-w-0 break-words rounded-lg bg-white/5 px-3 py-2">
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
   'Act as an exam-focused tutor for a BBA 2nd year student studying a numerical/practical subject.',

'Study context:',
`- Subject: ${subject.title}`,
`- Lesson ${lesson.lessonNumber}: ${lesson.title}`,
`- Scope: ${lesson.covers}`,
formulas.length
? `- Important formulas: ${formulas.join(', ')}`
: '- Include formulas only when relevant.',

'Teach the lesson topic-by-topic in this exact order:',
numberedTopics,

'For EACH topic, strictly follow this structure:',

'1) Concept Explanation',
'- Start with a simple but slightly detailed explanation.',
'- Keep explanations exam-focused and practical.',
'- Explain WHY the concept is used in business/numerical problems.',

'2) Definitions and Notations',
'- Include important definitions, symbols, and notation meanings if relevant.',

'3) Formula Section',
'- Show formulas clearly using proper mathematical formatting.',
'- Explain when to use each formula.',
'- Explain meaning of variables/symbols.',

'4) ASCII Diagram / Flow Structure (if useful)',
'- Generate simple ASCII diagrams, process flows, or structure blocks when concepts are process-based.',

'5) Solved Example',
'- Generate at least 1 fully solved exam-style problem.',
'- Include:',
'  • question',
'  • identified values',
'  • formula selection',
'  • substitution',
'  • step-by-step solution',
'  • final answer',

'Tone and formatting rules:',
'- Use clean headings and structured formatting.',
'- Avoid long theory paragraphs.',
'- Keep answers practical and step-by-step.',
'- Use tables where comparison/data is involved.',
'- Use concise but informative language.',
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
  const location = useLocation()
  const { subjectId, lessonId } = useParams()
  const hasTrackedLessonOpenRef = useRef(false)
  const {
    state: { user, session },
  } = useAppStore()
  const subject = getStudySubjectById(subjectId)
  const lesson = getStudyLessonById(subjectId, lessonId)
  const basePath = location.pathname.startsWith('/app/') ? '/app/study' : '/study'

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
  const topicsSubtitle = subject?.contentType === 'theory'
    ? 'Each topic is organized like a visual study guide with concepts, comparisons, and use cases.'
    : subject?.contentType === 'hybrid'
      ? 'Each topic blends theory notes with formulas, solved examples, and practice.'
      : 'Each topic combines explanation and examples as they appear in the PDF.'
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

  const hasLessonPractice = useMemo(() => {
    if (!lesson) {
      return false
    }

    const numericals = Array.isArray(lesson.numericals) ? lesson.numericals : []
    if (numericals.length) {
      return true
    }

    if (!Array.isArray(lesson.topics)) {
      return false
    }

    return lesson.topics.some((topic) => (
      (Array.isArray(topic?.solvedExamples) && topic.solvedExamples.length) ||
      (Array.isArray(topic?.practiceQuestions) && topic.practiceQuestions.length) ||
      (Array.isArray(topic?.mistakeNotes) && topic.mistakeNotes.length)
    ))
  }, [lesson])

  const hasLessonYoutube = useMemo(() => (
    Boolean(subject?.id && lesson?.id && hasLessonYoutubeLearning(subject.id, lesson.id))
  ), [lesson?.id, subject?.id])

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
    navigate(`${basePath}/${subject.id}/${lesson.id}/pdf?topic=${topic.id}`)
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
    navigate(`${basePath}/${subject.id}/${lesson.id}/practice/${topic.id}`)
  }

  const openLessonPractice = () => {
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_lesson_practice_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
      lessonName: lesson.title,
    })
    navigate(`${basePath}/${subject.id}/${lesson.id}/practice`)
  }

  const openLessonYoutube = () => {
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_lesson_youtube_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
      lessonName: lesson.title,
    })
    navigate(`${basePath}/${subject.id}/${lesson.id}/youtube`)
  }

  const toggleTopicDetails = (topicId) => {
    setOpenTopicId((current) => (current === topicId ? null : topicId))
  }

  return (
    <section className="space-y-3 pb-2 sm:space-y-4">
      {/* Back nav */}
      <div className="flex items-center gap-3 rounded-2xl bg-[#4A466A] px-4 py-3 ring-1 ring-white/5">
        <StudyBackButton
          fallbackTo={`/study/${subject.id}`}
          label="Go back"
          iconOnly
          className="h-8 w-8 text-base"
        />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#9F9AB5]">StudyMe</span>
      </div>

      {/* Lesson header */}
      <header>
        <h1 className="text-2xl font-extrabold text-[#F7F4FF] sm:text-3xl">{lesson.title}</h1>
        <p className="mt-1 text-xs text-[#9F9AB5]">Lesson {lesson.lessonNumber} · {subject.title}</p>
        <p className="mt-2 text-sm text-[#D8D4E7]">{lesson.covers}</p>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleLessonCompleted}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-[#1D183E] transition hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #FF916C 0%, #FFAA8D 100%)' }}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Mark complete
          </button>
          <button
            type="button"
            onClick={handleLessonImportantToggle}
            disabled={(importanceStatus !== 'success' && importanceStatus !== 'unauthenticated') || isTogglingLessonImportance}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition ${
              lessonImportance?.important
                ? 'border-[#FFB23E]/50 bg-[#FFB23E]/15 text-[#FFB23E]'
                : 'border-white/20 text-[#D8D4E7] hover:bg-white/10'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" /></svg>
            {isTogglingLessonImportance ? 'Updating...' : lessonImportance?.important ? 'Marked important' : 'Mark important'}
            {lessonImportance ? (
              <span className="ml-1 rounded-full bg-white/10 px-1.5 py-px text-[10px] font-bold">{lessonImportance.importantCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={openLessonAi}
            className="flex items-center gap-1.5 rounded-full border border-[#FF916C]/40 bg-[#FF916C]/10 px-4 py-2 text-xs font-semibold text-[#FF916C] transition hover:bg-[#FF916C]/20"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /></svg>
            Study with AI
          </button>
          {hasLessonPractice ? (
            <button
              type="button"
              onClick={openLessonPractice}
              className="flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-[#D8D4E7] transition hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 3 14 9-14 9V3Z" /></svg>
              Practice
            </button>
          ) : null}
          {hasLessonYoutube ? (
            <button
              type="button"
              onClick={openLessonYoutube}
              className="flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-[#D8D4E7] transition hover:bg-white/10"
            >
              Learn with YouTube
            </button>
          ) : null}
        </div>
        {importanceFeedback ? <span className="mt-2 inline-block text-xs text-[#FFD2C2]">{importanceFeedback}</span> : null}
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

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      {section.formulas.map((formula, formulaIndex) => {
                        const notationEntries = getFormulaNotationEntries(formula)
                        const notationKey = `${section.title}-${formula.name}-${formulaIndex}`
                        const isMobileNotationOpen = Boolean(mobileNotationOpenById[notationKey])

                        return (
                        <div key={formula.name} className="rounded-xl bg-[#3A315D]/80 p-2.5 ring-1 ring-white/10 sm:p-3">
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
                                <div className="mt-1">
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
          subtitle={topicsSubtitle}
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
                  topic.summary ? 'Summary' : '',
                  topic.details ? 'Detailed Explanation' : '',
                  Array.isArray(topic.definitions) && topic.definitions.length ? 'Definitions' : '',
                  Array.isArray(topic.notations) && topic.notations.length ? 'Notations' : '',
                  Array.isArray(topic.concepts) && topic.concepts.length ? 'Concepts' : '',
                  topic.asciiDiagram ? 'Diagram' : '',
                  topic.comparisonTable?.rows?.length ? 'Comparison' : '',
                  Array.isArray(topic.useCases) && topic.useCases.length ? 'Use Cases' : '',
                  topic.analogy ? 'Analogy' : '',
                ].filter(Boolean)

                return (
                  <article
                    key={topic.id}
                    aria-expanded={isExpanded}
                    className={`min-w-0 rounded-xl border px-2.5 py-3 sm:px-3 transition ${
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
                      className="w-full min-w-0 cursor-pointer text-left"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#F4F1FF]">{topic.title}</p>
                          {!isExpanded && topic.summary ? <p className="mt-1 break-words text-xs leading-relaxed text-[#D8D3E8]">{topic.summary}</p> : null}
                          {!isExpanded ? (
                            <p className="mt-1 break-words text-xs text-[#D8D3E8]">
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
                          <>
                            <div className="mt-2 space-y-1.5 sm:hidden">
                              {subtopics.map((item, index) => (
                                <div key={`${topic.id}-${item}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-[#E7DEDE]">
                                  <span className="font-semibold text-[#F2CA98]">{index + 1}.</span> {item}
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
                              {subtopics.map((item) => (
                                <span key={`${topic.id}-${item}`} className="max-w-full break-words rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-[#E7DEDE]">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </>
                        ) : null}

                        <TopicStudyGuide topic={topic} />
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
