import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MarksDetailCard from '../components/marks/MarksDetailCard'
import MarksRadarChart from '../components/marks/MarksRadarChart'
import SubjectSelectorGrid from '../components/marks/SubjectSelectorGrid'
import useAppStore from '../hooks/useAppStore'
import { fetchConsolidatedMarks, isSessionExpiredError } from '../services/attendanceApi'

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function toSubjectCode(subject) {
  const shortName = String(subject?.shortName || '').trim().toUpperCase()
  if (shortName) return shortName
  const name = String(subject?.name || '').trim()
  if (!name) return 'SUBJ'
  const initials = name.split(/\s+/).map((s) => s[0]).join('').toUpperCase()
  return initials || name.slice(0, 6).toUpperCase()
}

function normalizeSubjectName(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function safeNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeComponentValue(raw) {
  const name = String(raw?.name || raw?.component || '').trim()
  const fallback = raw?.numericValue ?? raw?.numeric_value ?? raw?.value
  const display = String(raw?.value ?? raw?.weightage ?? fallback ?? '').trim()
  return {
    name,
    value: display || '-',
    numericValue: safeNumber(raw?.numericValue ?? raw?.numeric_value),
    maxValue: safeNumber(raw?.maxValue ?? raw?.max_value),
  }
}

function normalizeComponentList(raw) {
  if (Array.isArray(raw?.components)) {
    return raw.components.map(normalizeComponentValue).filter((c) => c.name)
  }
  if (raw?.components && typeof raw.components === 'object') {
    return Object.entries(raw.components).map(([name, value]) => ({
      name: String(name || '').trim(),
      value: value === null || value === undefined ? '-' : String(value),
      numericValue: safeNumber(value),
      maxValue: null,
    }))
  }
  return []
}

function normalizeMarksSubject(raw) {
  const components = normalizeComponentList(raw)
  const explicitTotal = safeNumber(raw?.total)
  const derivedTotal = components.reduce((sum, c) => sum + (c.numericValue || 0), 0)
  const derivedMaxTotal = components.reduce((sum, c) => sum + (c.maxValue || 0), 0)
  const hasNumeric = components.some((c) => c.numericValue !== null)
  return {
    subjectCode: String(raw?.subjectCode || raw?.subject_code || raw?.code || '').trim().toUpperCase(),
    subjectName: String(raw?.subjectName || raw?.subject_name || raw?.name || '').trim(),
    units: String(raw?.units || '').trim() || null,
    components,
    total: hasNumeric ? derivedTotal : (explicitTotal ?? 0),
    maxTotal: safeNumber(raw?.maxTotal ?? raw?.max_total) || derivedMaxTotal || 60,
  }
}

function Marks() {
  const navigate = useNavigate()
  const { state: { attendance, session, user }, actions } = useAppStore()
  const isDemo = user.authProvider === 'demo'

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
    if (!hasFetchedMarks) return []
    return subjectOptions
      .map((s) => ({ subjectCode: s.subjectCode, total: marksByCode[s.subjectCode]?.total }))
      .filter((e) => Number.isFinite(Number(e.total)))
  }, [hasFetchedMarks, marksByCode, subjectOptions])

  // Compute overview stats
  const overviewStats = useMemo(() => {
    if (!hasFetchedMarks || !chartData.length) return null

    const totalCredits = subjectOptions.reduce((sum, s) => {
      const marks = marksByCode[s.subjectCode]
      return sum + (Number(marks?.units) || 0)
    }, 0)

    // Credit-weighted average
    let weightedSum = 0
    let creditSum = 0
    subjectOptions.forEach((s) => {
      const marks = marksByCode[s.subjectCode]
      if (!marks) return
      const credit = Number(marks.units) || 1
      const pct = marks.maxTotal > 0 ? (marks.total / marks.maxTotal) * 100 : 0
      weightedSum += pct * credit
      creditSum += credit
    })
    const avg = creditSum > 0 ? weightedSum / creditSum : 0

    // Strongest and weakest
    let strongest = null
    let weakest = null
    let highestPct = -1
    let lowestPct = 101

    subjectOptions.forEach((s) => {
      const marks = marksByCode[s.subjectCode]
      if (!marks || marks.maxTotal <= 0) return
      const pct = (marks.total / marks.maxTotal) * 100
      if (pct > highestPct) { highestPct = pct; strongest = { code: s.subjectCode, pct } }
      if (pct < lowestPct) { lowestPct = pct; weakest = { code: s.subjectCode, pct } }
    })

    return { avg, totalCredits, strongest, weakest }
  }, [chartData.length, hasFetchedMarks, marksByCode, subjectOptions])

  const loadMarksData = useCallback(async (forceRefresh = false) => {
    if (hasFetchedMarks && !forceRefresh) return true

    // Demo mode: load demo marks
    if (isDemo) {
      const { DEMO_MARKS } = await import('../constants/demoData')
      const marksRows = Array.isArray(DEMO_MARKS?.subjects) ? DEMO_MARKS.subjects : []
      const mapped = subjectOptions.reduce((acc, s) => {
        const match = marksRows.find((r) => normalizeCode(r.subjectCode || r.subject_code) === normalizeCode(s.subjectCode))
        return { ...acc, [s.subjectCode]: match ? normalizeMarksSubject(match) : null }
      }, {})
      setMarksByCode(mapped)
      setHasFetchedMarks(true)
      return true
    }

    if (!session.token) {
      actions.logout()
      navigate('/login', { replace: true })
      return false
    }

    try {
      setIsLoadingMarks(true)
      const response = await fetchConsolidatedMarks({ token: session.token, semesterId: session.selectedSemester, forceRefresh })
      const marksRows = Array.isArray(response?.subjects) ? response.subjects : []

      const normalizedByCode = marksRows.reduce((acc, row) => {
        const n = normalizeMarksSubject(row)
        const key = normalizeCode(n.subjectCode)
        if (!key) return acc
        return { ...acc, [n.subjectCode]: n, [key]: n }
      }, {})

      const normalizedByName = marksRows.reduce((acc, row) => {
        const n = normalizeMarksSubject(row)
        const nameKey = normalizeSubjectName(n.subjectName)
        if (!nameKey) return acc
        return { ...acc, [nameKey]: n }
      }, {})

      const mapped = subjectOptions.reduce((acc, s) => {
        const key = normalizeCode(s.subjectCode)
        const value = normalizedByCode[s.backendCode] || normalizedByCode[s.subjectCode] || normalizedByCode[key] || normalizedByName[s.nameKey] || null
        return { ...acc, [s.subjectCode]: value }
      }, {})

      setMarksByCode(mapped)
      setHasFetchedMarks(true)
      return true
    } catch (error) {
      if (isSessionExpiredError(error)) { actions.logout(); navigate('/login', { replace: true }); return false }
      setMarksError(error?.message || 'Unable to load marks right now.')
      return false
    } finally {
      setIsLoadingMarks(false)
    }
  }, [actions, hasFetchedMarks, navigate, session.selectedSemester, session.token, subjectOptions])

  useEffect(() => {
    if (isLoadingMarks || hasFetchedMarks) return
    void loadMarksData(false)
  }, [hasFetchedMarks, isLoadingMarks, loadMarksData])

  return (
    <section className="space-y-3 pb-3">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-extrabold text-[#F7F4FF] sm:text-3xl">Marks</h1>
        <p className="mt-0.5 text-[11px] text-[#9F9AB5]">Internal assessment across subjects</p>
      </header>

      {/* Top section: Stats + Radar */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        {/* Stats card */}
        <div className="rounded-2xl bg-[#4A466A] p-5 ring-1 ring-white/5">
          {overviewStats ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Avg (Credit-Wt.)</p>
                  <p className="mt-1 text-3xl font-extrabold text-[#4EF0A0]">{overviewStats.avg.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Credits</p>
                  <p className="mt-1 text-3xl font-extrabold text-[#F7F4FF]">{overviewStats.totalCredits}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Strongest</p>
                  <p className="mt-1 text-xl font-extrabold text-[#4EF0A0]">{overviewStats.strongest?.code || '—'}</p>
                  <p className="text-xs text-[#9F9AB5]">{overviewStats.strongest ? `${overviewStats.strongest.pct.toFixed(0)}%` : ''}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Needs Work</p>
                  <p className="mt-1 text-xl font-extrabold text-[#FF5B5B]">{overviewStats.weakest?.code || '—'}</p>
                  <p className="text-xs text-[#9F9AB5]">{overviewStats.weakest ? `${overviewStats.weakest.pct.toFixed(0)}%` : ''}</p>
                </div>
              </div>

              {overviewStats.weakest ? (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Study Suggestion</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#D8D4E7]">
                    Your weakest internal is <span className="font-bold text-[#F7F4FF]">{overviewStats.weakest.code}</span>. Open it in StudyMe to revise before the next assessment.
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full items-center justify-center py-8">
              <p className="text-sm text-[#9F9AB5]">{isLoadingMarks ? 'Loading marks...' : 'No marks data available.'}</p>
            </div>
          )}
        </div>

        {/* Radar chart card */}
        <div className="rounded-2xl bg-[#4A466A] p-4 ring-1 ring-white/5">
          <MarksRadarChart data={chartData} isLoading={isLoadingMarks && !hasFetchedMarks} selectedSubjectCode={selectedSubjectCode} />
        </div>
      </div>

      {/* Consolidated marks list */}
      <div className="rounded-2xl bg-[#4A466A] p-5 ring-1 ring-white/5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#F7F4FF]">Consolidated marks list</h2>
            <p className="text-[11px] text-[#9F9AB5]">Select a subject to see components</p>
          </div>
          <button
            type="button"
            onClick={() => { setMarksError(''); loadMarksData(true) }}
            disabled={isLoadingMarks}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#D8D4E7] transition hover:bg-white/10 disabled:opacity-60"
            aria-label="Refresh marks"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" /></svg>
          </button>
        </div>

        <div className="mt-4">
          <SubjectSelectorGrid
            subjects={subjectOptions}
            selectedSubjectCode={selectedSubjectCode}
            disabled={isLoadingMarks}
            onSelect={(code) => { setSelectedSubjectCode(code); setMarksError('') }}
          />
        </div>

        {marksError ? (
          <div className="mt-4 rounded-xl border border-[#FF5B5B]/40 bg-[#FF5B5B]/10 px-3 py-2 text-xs text-[#FFD4D4]">
            {marksError}
          </div>
        ) : null}

        {isLoadingMarks && selectedSubjectCode ? (
          <div className="mt-4 animate-pulse rounded-2xl bg-[#E8DCC8]/20 p-5">
            <div className="h-4 w-20 rounded bg-white/10" />
            <div className="mt-3 space-y-2">
              <div className="h-4 rounded bg-white/10" />
              <div className="h-4 rounded bg-white/10" />
              <div className="h-4 rounded bg-white/10" />
            </div>
          </div>
        ) : null}

        {hasFetchedMarks && selectedSubjectCode && selectedMarks && !isLoadingMarks ? (
          <div className="mt-4">
            <MarksDetailCard marks={selectedMarks} displaySubjectCode={selectedSubjectCode} />
          </div>
        ) : null}

        {hasFetchedMarks && selectedSubjectCode && !selectedMarks && !isLoadingMarks ? (
          <p className="mt-4 text-sm text-[#9F9AB5]">Marks are not available yet for {selectedSubjectCode}.</p>
        ) : null}
      </div>
    </section>
  )
}

export default Marks
