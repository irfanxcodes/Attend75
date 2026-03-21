import { useCallback, useMemo } from 'react'
import AttendanceCircle from '../components/dashboard/AttendanceCircle'
import Header from '../components/dashboard/Header'
import PredictionCard from '../components/dashboard/PredictionCard'
import SubjectList from '../components/dashboard/SubjectList'
import useAppStore from '../hooks/useAppStore'
import { fetchAttendance } from '../services/attendanceApi'
import { calculatePrediction } from '../utils/calculations'

function Dashboard() {
  const {
    state: {
      user,
      attendance: { overallPercentage, subjects },
      selectedTarget,
      ui,
    },
    actions,
  } = useAppStore()

  const prediction = useMemo(() => calculatePrediction(subjects, selectedTarget), [subjects, selectedTarget])
  const totals = useMemo(
    () =>
      subjects.reduce(
        (accumulator, subject) => ({
          totalClasses: accumulator.totalClasses + subject.totalClasses,
          totalAttended: accumulator.totalAttended + subject.attendedClasses,
        }),
        { totalClasses: 0, totalAttended: 0 },
      ),
    [subjects],
  )

  const status = useMemo(() => {
    if (overallPercentage > 75) return 'safe'
    if (overallPercentage >= 60) return 'borderline'
    return 'danger'
  }, [overallPercentage])

  const displayName = user.portalName || user.name

  const handleRefresh = useCallback(async () => {
    try {
      actions.setLoading(true)
      actions.setError('')
      const attendance = await fetchAttendance()
      actions.setAttendanceData(attendance)
    } catch (error) {
      actions.setError(error.message)
    } finally {
      actions.setLoading(false)
    }
  }, [actions])

  return (
    <section className="space-y-4">
      <Header userName={displayName} />

      {ui.error ? (
        <div className="rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/15 p-3 text-sm text-[#E7DEDE]">
          {ui.error}
        </div>
      ) : null}

      <AttendanceCircle
        percentage={overallPercentage}
        totalClasses={totals.totalClasses}
        totalAttended={totals.totalAttended}
        status={status}
        onRefresh={handleRefresh}
        isRefreshing={ui.isLoading}
      />
      <PredictionCard
        selectedTarget={selectedTarget}
        prediction={prediction}
        onChangeTarget={actions.setSelectedTarget}
      />
      <SubjectList subjects={subjects} />
    </section>
  )
}

export default Dashboard
