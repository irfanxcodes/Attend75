/**
 * Calculate total absent classes across all subjects.
 * @param {Array} subjects - Array of subject objects with totalClasses and attendedClasses.
 * @returns {number}
 */
export function calculateTotalAbsents(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return 0
  }

  return subjects.reduce((total, subject) => {
    const conducted = Number(subject.totalClasses) || 0
    const attended = Number(subject.attendedClasses) || 0
    return total + Math.max(0, conducted - attended)
  }, 0)
}
