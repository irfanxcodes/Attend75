import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MarksDetailCard from '../components/marks/MarksDetailCard'
import MarksRadarChart from '../components/marks/MarksRadarChart'
import SubjectSelectorGrid from '../components/marks/SubjectSelectorGrid'
import useAppStore from '../hooks/useAppStore'
import { fetchConsolidatedMarks, isSessionExpiredError } from '../services/attendanceApi'

function normalizeCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
      />
    </svg>
  )
}

function toSubjectCode(subject) {
  const shortName = String(subject?.shortName || '').trim().toUpperCase()
  if (shortName) {
    return shortName
  }

  const name = String(subject?.name || '').trim()
  if (!name) {
    return 'SUBJ'
  }

  const initials = name
    .split(/\s+/)
    .map((segment) => segment[0])
    .join('')
    .toUpperCase()

  return initials || name.slice(0, 6).toUpperCase()
}

function normalizeSubjectName(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function safeNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeComponentValue(rawComponent) {
  const componentName = String(rawComponent?.name || rawComponent?.component || '').trim()
  const fallbackValue = rawComponent?.numericValue ?? rawComponent?.numeric_value ?? rawComponent?.value
  const displayValue = String(rawComponent?.value ?? rawComponent?.weightage ?? fallbackValue ?? '').trim()

  return {
    name: componentName,
    value: displayValue || '-',
    numericValue: safeNumber(rawComponent?.numericValue ?? rawComponent?.numeric_value),
    maxValue: safeNumber(rawComponent?.maxValue ?? rawComponent?.max_value),
  }
}

function normalizeComponentList(rawSubject) {
  if (Array.isArray(rawSubject?.components)) {
    return rawSubject.components.map((component) => normalizeComponentValue(component)).filter((component) => component.name)
  }

  if (rawSubject?.components && typeof rawSubject.components === 'object') {
    return Object.entries(rawSubject.components).map(([name, value]) => ({
      name: String(name || '').trim(),
      value: value === null || value === undefined ? '-' : String(value),
      numericValue: safeNumber(value),
      maxValue: null,
    }))
  }

  return []
}

function normalizeMarksSubject(rawSubject) {
  const components = normalizeComponentList(rawSubject)
  const explicitTotal = safeNumber(rawSubject?.total)
  const derivedTotal = components.reduce((sum, component) => sum + (component.numericValue || 0), 0)
  const derivedMaxTotal = components.reduce((sum, component) => sum + (component.maxValue || 0), 0)
  const hasNumericComponents = components.some((component) => component.numericValue !== null)

  return {
    subjectCode: String(rawSubject?.subjectCode || rawSubject?.subject_code || rawSubject?.code || '').trim().toUpperCase(),
    subjectName: String(rawSubject?.subjectName || rawSubject?.subject_name || rawSubject?.name || '').trim(),
    units: String(rawSubject?.units || '').trim() || null,
    components,
    total: hasNumericComponents ? derivedTotal : (explicitTotal ?? 0),
    maxTotal: safeNumber(rawSubject?.maxTotal ?? rawSubject?.max_total) || derivedMaxTotal || 60,
  }
}

function Marks() {
  const navigate = useNavigate()
  const {
    state: { attendance, session },
    actions,
  } = useAppStore()

  const [selectedSubjectCode, setSelectedSubjectCode] = useState('')
  const [marksByCode, setMarksByCode] = useState({})
  const [hasFetchedMarks, setHasFetchedMarks] = useState(false)
  const [isLoadingMarks, setIsLoadingMarks] = useState(false)
  const [marksError, setMarksError] = useState('')

  const subjectOptions = useMemo(() => {
    const subjects = Array.isArray(attendance?.subjects) ? attendance.subjects : []
    return subjects.map((subject) => ({
      subjectId: String(subject?.id || toSubjectCode(subject)).toLowerCase(),
      subjectCode: toSubjectCode(subject),
      subjectName: String(subject?.name || '').trim(),
      backendCode: normalizeCode(subject?.id),
      nameKey: normalizeSubjectName(subject?.name),
    }))
  }, [attendance?.subjects])

  const selectedMarks = selectedSubjectCode ? marksByCode[selectedSubjectCode] : null

  const chartData = useMemo(() => {
    if (!hasFetchedMarks) {
      return []
    }

    return subjectOptions
      .map((subject) => ({
        subjectCode: subject.subjectCode,
        total: marksByCode[subject.subjectCode]?.total,
      }))
      .filter((entry) => Number.isFinite(Number(entry.total)))
  }, [hasFetchedMarks, marksByCode, subjectOptions])

  const loadMarksData = useCallback(async (forceRefresh = false) => {
    if (hasFetchedMarks && !forceRefresh) {
      return true
    }

    if (!session.token) {
      actions.logout()
      window.localStorage.removeItem('attend75.selectedSemester')
      navigate('/login', { replace: true })
      return false
    }

    try {
      setIsLoadingMarks(true)
      const response = await fetchConsolidatedMarks({
        token: session.token,
        semesterId: session.selectedSemester,
      })

      const marksRows = Array.isArray(response?.subjects) ? response.subjects : []

      const normalizedByCode = marksRows.reduce((accumulator, row) => {
        const normalized = normalizeMarksSubject(row)
        const key = normalizeCode(normalized.subjectCode)
        if (!key) {
          return accumulator
        }

        return {
          ...accumulator,
          [normalized.subjectCode]: normalized,
          [key]: normalized,
        }
      }, {})

      const normalizedByName = marksRows.reduce((accumulator, row) => {
        const normalized = normalizeMarksSubject(row)
        const nameKey = normalizeSubjectName(normalized.subjectName)
        if (!nameKey) {
          return accumulator
        }

        return {
          ...accumulator,
          [nameKey]: normalized,
        }
      }, {})

      const mappedToSelectorCodes = subjectOptions.reduce((accumulator, subject) => {
        const key = normalizeCode(subject.subjectCode)
        const value =
          normalizedByCode[subject.backendCode] ||
          normalizedByCode[subject.subjectCode] ||
          normalizedByCode[key] ||
          normalizedByName[subject.nameKey] ||
          null

        return {
          ...accumulator,
          [subject.subjectCode]: value,
        }
      }, {})

      setMarksByCode(mappedToSelectorCodes)
      setHasFetchedMarks(true)
      return true
    } catch (error) {
      if (isSessionExpiredError(error)) {
        actions.logout()
        window.localStorage.removeItem('attend75.selectedSemester')
        navigate('/login', { replace: true })
        return false
      }

      setMarksError(error?.message || 'Unable to load marks right now.')
      return false
    } finally {
      setIsLoadingMarks(false)
    }
  }, [actions, hasFetchedMarks, navigate, session.selectedSemester, session.token, subjectOptions])

  useEffect(() => {
    if (isLoadingMarks || hasFetchedMarks) {
      return
    }

    void loadMarksData(false)
  }, [hasFetchedMarks, isLoadingMarks, loadMarksData])

  const handleSelectSubject = async (subjectCode) => {
    setSelectedSubjectCode(subjectCode)
    setMarksError('')
  }

  const handleRefreshMarks = async () => {
    setMarksError('')
    await loadMarksData(true)
  }

  return (
    <section className="space-y-6 pb-3">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-[#E7DEDE] sm:text-4xl">Marks</h1>
        <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">Review consolidated internals and compare performance by subject.</p>
      </header>

      <MarksRadarChart data={chartData} isLoading={isLoadingMarks && !hasFetchedMarks} />

      <section className="rounded-3xl bg-[#312051] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#E7DEDE]">Consolidated Marks List</h2>
          <button
            type="button"
            onClick={handleRefreshMarks}
            disabled={isLoadingMarks || !session.token}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-[#3A315D] text-[#E7DEDE] transition-all duration-200 hover:bg-[#4A3E73] hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Refresh marks"
            title="Refresh marks"
          >
            <RefreshIcon />
          </button>
        </div>

        <div className="mt-4">
          <SubjectSelectorGrid
            subjects={subjectOptions}
            selectedSubjectCode={selectedSubjectCode}
            disabled={isLoadingMarks}
            onSelect={handleSelectSubject}
          />
        </div>

        {isLoadingMarks ? (
          <div className="mt-4 rounded-lg border border-white/20 bg-[#3A315D] px-3 py-2 text-sm text-[#D1D1D1]">
            Loading marks...
          </div>
        ) : null}

        {marksError ? (
          <div className="mt-4 rounded-lg border border-[#EF4444]/50 bg-[#7F1D1D]/20 px-3 py-2 text-sm text-[#FECACA]">
            {marksError}
          </div>
        ) : null}

        {!hasFetchedMarks && !isLoadingMarks && !marksError ? (
          <p className="mt-4 text-sm text-[#D1D1D1]">Marks data is not available right now.</p>
        ) : null}

        {selectedSubjectCode && isLoadingMarks ? (
          <div className="mt-6 animate-pulse rounded-3xl bg-[#C9B7A3] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="h-4 w-20 rounded bg-[#A28E76]/50" />
              <div className="h-4 w-16 rounded bg-[#A28E76]/50" />
            </div>
            <div className="space-y-2.5">
              <div className="h-5 rounded bg-[#A28E76]/40" />
              <div className="h-5 rounded bg-[#A28E76]/40" />
              <div className="h-5 rounded bg-[#A28E76]/40" />
            </div>
            <div className="mt-4 h-px bg-[#5C4B3A]/20" />
            <div className="mt-3 h-6 w-24 rounded bg-[#A28E76]/50" />
          </div>
        ) : null}

        {hasFetchedMarks && selectedSubjectCode && selectedMarks && !isLoadingMarks ? (
          <div className="mt-6 transition-all duration-200 ease-out">
            <MarksDetailCard marks={selectedMarks} displaySubjectCode={selectedSubjectCode} />
          </div>
        ) : null}

        {hasFetchedMarks && selectedSubjectCode && !selectedMarks && !isLoadingMarks ? (
          <p className="mt-4 text-sm text-[#D1D1D1]">Marks are not available yet for {selectedSubjectCode}.</p>
        ) : null}
      </section>
    </section>
  )
}

export default Marks
