function safeNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function deriveClassesLeft(subject) {
  const explicitRemaining = Number(subject.remainingClasses)
  if (Number.isFinite(explicitRemaining)) {
    return Math.max(0, explicitRemaining)
  }

  const totalSessions = Number(subject.totalSessions)
  if (Number.isFinite(totalSessions) && totalSessions > 0) {
    return Math.max(0, totalSessions - safeNumber(subject.totalClasses))
  }

  return 0
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
    classesLeft: deriveClassesLeft(subject),
  }))
}

export function calculateOverallAttendance(subjects = []) {
  const totals = subjects.reduce(
    (accumulator, subject) => {
      return {
        attended: accumulator.attended + safeNumber(subject.attendedClasses),
        total: accumulator.total + safeNumber(subject.totalClasses),
        classesLeft: accumulator.classesLeft + safeNumber(subject.classesLeft),
      }
    },
    { attended: 0, total: 0, classesLeft: 0 },
  )

  return {
    attended: totals.attended,
    total: totals.total,
    classesLeft: totals.classesLeft,
    percentage: calculateAttendancePercentage(totals.attended, totals.total),
  }
}

export function calculateClassesToAttend(attendedClasses, totalClasses, targetPercentage, classesLeft = 0) {
  const attended = safeNumber(attendedClasses)
  const conducted = safeNumber(totalClasses)
  const left = safeNumber(classesLeft)
  const target = safeNumber(targetPercentage) / 100

  if (target <= 0 || target >= 1) {
    return 0
  }

  // Total semester sessions = classes conducted so far + remaining
  const totalSessions = conducted + left

  if (totalSessions <= 0) return 0

  // How many of the remaining classes must be attended to hit the target?
  // (attended + x) / totalSessions >= target  →  x >= target * totalSessions - attended
  const needed = target * totalSessions - attended
  return Math.max(0, Math.ceil(needed))
}

export function calculateClassesCanMiss(attendedClasses, totalClasses, targetPercentage, classesLeft = 0) {
  const attended = safeNumber(attendedClasses)
  const conducted = safeNumber(totalClasses)
  const left = safeNumber(classesLeft)
  const target = safeNumber(targetPercentage) / 100

  if (target <= 0) {
    return 0
  }

  // Total semester sessions = conducted + remaining
  const totalSessions = conducted + left

  if (totalSessions <= 0) return 0

  // How many of the remaining classes can be skipped while still hitting the target?
  // (attended + (left - x)) / totalSessions >= target  →  x <= attended + left - target * totalSessions
  const canMiss = Math.floor(attended + left - target * totalSessions)
  return Math.max(0, canMiss)
}

export function calculatePrediction(subjects = [], targetPercentage = 75) {
  const overall = calculateOverallAttendance(subjects)

  return {
    target: targetPercentage,
    toAttend: calculateClassesToAttend(overall.attended, overall.total, targetPercentage, overall.classesLeft),
    canMiss: calculateClassesCanMiss(overall.attended, overall.total, targetPercentage, overall.classesLeft),
  }
}

export function calculatePredictionFeasibility(subjects = [], targetPercentage = 75, backendFeasibility = null) {
  const fromBackend = backendFeasibility?.overall
  const backendMax = Number(fromBackend?.max_possible_percentage)

  if (Number.isFinite(backendMax)) {
    return {
      isTargetAchievable: targetPercentage <= backendMax,
      maxPossiblePercentage: Number(backendMax.toFixed(2)),
    }
  }

  const totals = subjects.reduce(
    (accumulator, subject) => {
      const attended = safeNumber(subject.attendedClasses)
      const sessions = safeNumber(subject.totalClasses)
      const totalSessions = safeNumber(subject.totalSessions)

      return {
        attended: accumulator.attended + attended,
        sessions: accumulator.sessions + sessions,
        totalSessions: accumulator.totalSessions + (totalSessions > 0 ? totalSessions : 0),
        hasMissingTotals: accumulator.hasMissingTotals || totalSessions <= 0,
      }
    },
    { attended: 0, sessions: 0, totalSessions: 0, hasMissingTotals: false },
  )

  if (totals.hasMissingTotals || totals.totalSessions <= 0) {
    return {
      isTargetAchievable: true,
      maxPossiblePercentage: null,
    }
  }

  const remaining = Math.max(totals.totalSessions - totals.sessions, 0)
  const maxPossible = ((totals.attended + remaining) / totals.totalSessions) * 100
  const roundedMax = Number(maxPossible.toFixed(2))

  return {
    isTargetAchievable: targetPercentage <= roundedMax,
    maxPossiblePercentage: roundedMax,
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
