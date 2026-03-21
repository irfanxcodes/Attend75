function safeNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function calculateAttendancePercentage(attendedClasses, totalClasses) {
  const attended = safeNumber(attendedClasses)
  const total = safeNumber(totalClasses)

  if (total <= 0) {
    return 0
  }

  return Math.round((attended / total) * 100)
}

export function enrichSubjectsWithPercentage(subjects = []) {
  return subjects.map((subject) => ({
    ...subject,
    percentage: calculateAttendancePercentage(subject.attendedClasses, subject.totalClasses),
  }))
}

export function calculateOverallAttendance(subjects = []) {
  const totals = subjects.reduce(
    (accumulator, subject) => {
      return {
        attended: accumulator.attended + safeNumber(subject.attendedClasses),
        total: accumulator.total + safeNumber(subject.totalClasses),
      }
    },
    { attended: 0, total: 0 },
  )

  return {
    attended: totals.attended,
    total: totals.total,
    percentage: calculateAttendancePercentage(totals.attended, totals.total),
  }
}

export function calculateClassesToAttend(attendedClasses, totalClasses, targetPercentage) {
  const attended = safeNumber(attendedClasses)
  const total = safeNumber(totalClasses)
  const target = safeNumber(targetPercentage) / 100

  if (target <= 0 || target >= 1) {
    return 0
  }

  const needed = (target * total - attended) / (1 - target)
  return Math.max(0, Math.ceil(needed))
}

export function calculateClassesCanMiss(attendedClasses, totalClasses, targetPercentage) {
  const attended = safeNumber(attendedClasses)
  const total = safeNumber(totalClasses)
  const target = safeNumber(targetPercentage) / 100

  if (target <= 0) {
    return 0
  }

  const canMiss = Math.floor(attended / target - total)
  return Math.max(0, canMiss)
}

export function calculatePrediction(subjects = [], targetPercentage = 75) {
  const overall = calculateOverallAttendance(subjects)

  return {
    target: targetPercentage,
    toAttend: calculateClassesToAttend(overall.attended, overall.total, targetPercentage),
    canMiss: calculateClassesCanMiss(overall.attended, overall.total, targetPercentage),
  }
}

export function mapHistoryTrend(historyItems = []) {
  return historyItems.map((item) => {
    const total = safeNumber(item.presentCount) + safeNumber(item.absentCount)
    const value = total > 0 ? Math.round((safeNumber(item.presentCount) / total) * 100) : 0

    return {
      ...item,
      total,
      attendanceRate: value,
    }
  })
}
