import { useCallback, useMemo } from 'react'
import AttendanceCircle from '../components/dashboard/AttendanceCircle'
import Header from '../components/dashboard/Header'
import PredictionCard from '../components/dashboard/PredictionCard'
import RefreshButton from '../components/dashboard/RefreshButton'
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
      <Header userName={user.name} />

      {ui.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {ui.error}
        </div>
      ) : null}

      <AttendanceCircle percentage={overallPercentage} />
      <PredictionCard
        selectedTarget={selectedTarget}
        prediction={prediction}
        onChangeTarget={actions.setSelectedTarget}
      />
      <SubjectList subjects={subjects} />
      <RefreshButton isLoading={ui.isLoading} onRefresh={handleRefresh} />
    </section>
  )
}

export default Dashboard
