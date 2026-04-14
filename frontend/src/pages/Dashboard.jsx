import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import AttendanceCircle from '../components/dashboard/AttendanceCircle'
import Header from '../components/dashboard/Header'
import PredictionCard from '../components/dashboard/PredictionCard'
import SubjectList from '../components/dashboard/SubjectList'
import InstagramButton from '../components/common/InstagramButton'
import useAppStore from '../hooks/useAppStore'
import { fetchAttendance, isSessionExpiredError } from '../services/attendanceApi'
import { calculatePrediction, calculatePredictionFeasibility } from '../utils/calculations'

function Dashboard() {
  const navigate = useNavigate()
  const {
    state: {
      user,
      attendance: { overallPercentage, subjects, feasibility },
      session,
      selectedTarget,
      ui,
    },
    actions,
  } = useAppStore()

  const prediction = useMemo(() => calculatePrediction(subjects, selectedTarget), [subjects, selectedTarget])
  const predictionFeasibility = useMemo(
    () => calculatePredictionFeasibility(subjects, selectedTarget, feasibility),
    [feasibility, selectedTarget, subjects],
  )
  const hasSyncedSavedSemester = useRef(false)
  const totals = useMemo(
    () =>
      subjects.reduce(
        (accumulator, subject) => ({
          totalClasses: accumulator.totalClasses + subject.totalClasses,
          totalAttended: accumulator.totalAttended + subject.attendedClasses,
          totalClassesLeft: accumulator.totalClassesLeft + (subject.classesLeft || 0),
        }),
        { totalClasses: 0, totalAttended: 0, totalClassesLeft: 0 },
      ),
    [subjects],
  )

  const status = useMemo(() => {
    if (overallPercentage > 75) return 'safe'
    if (overallPercentage >= 60) return 'borderline'
    return 'danger'
  }, [overallPercentage])

  const isFirebaseUser = user.authProvider === 'firebase'
  const fullName = (user.name || '').trim()
  const firstName = fullName.split(/\s+/)[0] || ''
  const guestRollNumber = (user.rollNumber || user.id || '').trim().toUpperCase()
  const displayName = isFirebaseUser ? firstName || fullName || guestRollNumber : guestRollNumber

  const handleRefresh = useCallback(async () => {
    try {
      actions.setLoading(true)
      actions.setError('')
      const result = await fetchAttendance({
        token: session.token,
        semesterId: session.selectedSemester,
        forceRefresh: true,
      })
      actions.setAttendanceData(result.attendanceData)
      actions.setSessionSemesters(result.semesters, result.selectedSemester)
      if (result.selectedSemester) {
        window.localStorage.setItem('attend75.selectedSemester', result.selectedSemester)
      }
    } catch (error) {
      if (isSessionExpiredError(error)) {
        actions.logout()
        window.localStorage.removeItem('attend75.selectedSemester')
        navigate('/login', { replace: true })
        return
      }
      actions.setError(error.message)
    } finally {
      actions.setLoading(false)
    }
  }, [actions, navigate, session.selectedSemester, session.token])

  const handleSemesterChange = useCallback(
    async (event) => {
      const semesterId = event.target.value
      actions.setSelectedSemester(semesterId)
      window.localStorage.setItem('attend75.selectedSemester', semesterId)

      try {
        actions.setLoading(true)
        actions.setError('')
        const result = await fetchAttendance({ token: session.token, semesterId })
        actions.setAttendanceData(result.attendanceData)
        actions.setSessionSemesters(result.semesters, result.selectedSemester || semesterId)
      } catch (error) {
        if (isSessionExpiredError(error)) {
          actions.logout()
          window.localStorage.removeItem('attend75.selectedSemester')
          navigate('/login', { replace: true })
          return
        }
        actions.setError(error.message)
      } finally {
        actions.setLoading(false)
      }
    },
    [actions, navigate, session.token],
  )

  useEffect(() => {
    if (hasSyncedSavedSemester.current) {
      return
    }

    if (!session.token || !session.semesters.length) {
      return
    }

    hasSyncedSavedSemester.current = true
    const savedSemester = window.localStorage.getItem('attend75.selectedSemester')
    const isValidSavedSemester = session.semesters.some((semester) => semester.id === savedSemester)

    if (!isValidSavedSemester || !savedSemester || savedSemester === session.selectedSemester) {
      if (session.selectedSemester) {
        window.localStorage.setItem('attend75.selectedSemester', session.selectedSemester)
      }
      return
    }

    actions.setSelectedSemester(savedSemester)
    void (async () => {
      try {
        actions.setLoading(true)
        actions.setError('')
        const result = await fetchAttendance({ token: session.token, semesterId: savedSemester })
        actions.setAttendanceData(result.attendanceData)
        actions.setSessionSemesters(result.semesters, result.selectedSemester || savedSemester)
      } catch (error) {
        if (isSessionExpiredError(error)) {
          actions.logout()
          window.localStorage.removeItem('attend75.selectedSemester')
          navigate('/login', { replace: true })
          return
        }
        actions.setError(error.message)
      } finally {
        actions.setLoading(false)
      }
    })()
  }, [actions, navigate, session.selectedSemester, session.semesters, session.token])

  return (
    <section className="space-y-4">
      <Header userName={displayName} />

      {ui.error ? (
        <div className="rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/15 p-3 text-sm text-[#E7DEDE]">
          {ui.error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/20 bg-[#312051] p-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="semester-select" className="text-sm font-medium text-[#D1D1D1]">
            Semester
          </label>
          <select
            id="semester-select"
            value={session.selectedSemester || ''}
            onChange={handleSemesterChange}
            disabled={ui.isLoading || !session.semesters.length}
            className="min-w-[160px] rounded-md border border-white/20 bg-[#3A315D] px-3 py-2 text-sm text-[#E7DEDE] outline-none transition-colors focus:border-[#E8A08C] disabled:opacity-60"
          >
            {!session.semesters.length ? <option value="">No semesters</option> : null}
            {session.semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <AttendanceCircle
        percentage={overallPercentage}
        totalClasses={totals.totalClasses}
        totalAttended={totals.totalAttended}
        totalClassesLeft={totals.totalClassesLeft}
        status={status}
        onRefresh={handleRefresh}
        isRefreshing={ui.isLoading}
      />
      <PredictionCard
        selectedTarget={selectedTarget}
        currentAttendance={overallPercentage}
        prediction={prediction}
        feasibility={predictionFeasibility}
        onChangeTarget={actions.setSelectedTarget}
      />
      <SubjectList subjects={subjects} />

      <div className="flex items-center justify-end gap-2 px-1 pb-1">
        <span className="text-xs text-[#D8D3E8]/80">Follow us</span>
        <InstagramButton className="h-7 w-7 bg-[#3A315D]" iconClassName="h-3.5 w-3.5" />
      </div>
    </section>
  )
}

export default Dashboard
