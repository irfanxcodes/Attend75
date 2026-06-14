/**
 * Realistic demo data for Guest Mode.
 * Used to populate the app when users click "Explore as Guest".
 */

export const DEMO_USER = {
  id: 'DEMO_STUDENT',
  name: 'Demo Student',
  portalName: 'Demo Student',
  email: null,
  rollNumber: '24DEMO001',
  authProvider: 'demo',
  isAuthenticated: true,
}

export const DEMO_SESSION = {
  token: 'demo-session-token',
  semesters: [
    { id: 'sem4', label: 'Semester IV — Spring 2026' },
    { id: 'sem3', label: 'Semester III — Fall 2025' },
  ],
  selectedSemester: 'sem4',
}

export const DEMO_ATTENDANCE = {
  subjects: [
    {
      id: 'fm',
      name: 'Financial Management',
      shortName: 'FM',
      totalClasses: 36,
      attendedClasses: 28,
      totalSessions: 48,
      remainingClasses: 12,
      maxPossiblePercentage: 83.3,
    },
    {
      id: 'qbm',
      name: 'Quantitative Business Methods',
      shortName: 'QBM',
      totalClasses: 34,
      attendedClasses: 30,
      totalSessions: 48,
      remainingClasses: 14,
      maxPossiblePercentage: 91.7,
    },
    {
      id: 'ccfa',
      name: 'Corporate & Cost Financial Analysis',
      shortName: 'CCFA',
      totalClasses: 38,
      attendedClasses: 26,
      totalSessions: 48,
      remainingClasses: 10,
      maxPossiblePercentage: 75.0,
    },
    {
      id: 'ob',
      name: 'Organizational Behaviour',
      shortName: 'OB',
      totalClasses: 32,
      attendedClasses: 28,
      totalSessions: 48,
      remainingClasses: 16,
      maxPossiblePercentage: 91.7,
    },
    {
      id: 'imil',
      name: 'Indian Macro & Intl. Linkages',
      shortName: 'IMIL',
      totalClasses: 30,
      attendedClasses: 20,
      totalSessions: 48,
      remainingClasses: 18,
      maxPossiblePercentage: 79.2,
    },
    {
      id: 'ismm',
      name: 'Info Systems & Mgmt of Marketing',
      shortName: 'ISMM',
      totalClasses: 33,
      attendedClasses: 24,
      totalSessions: 48,
      remainingClasses: 15,
      maxPossiblePercentage: 81.3,
    },
  ],
  feasibility: null,
}

export const DEMO_MARKS = {
  subjects: [
    {
      subjectCode: 'FM',
      subject_code: 'FM',
      name: 'Financial Management',
      units: '4',
      total: 53.2,
      max_total: 60,
      components: [
        { name: 'CP - I', value: '5.00', numericValue: 5 },
        { name: 'CP - II', value: '5.00', numericValue: 5 },
        { name: 'NCP - I', value: '12.00', numericValue: 12 },
        { name: 'NCP - II', value: '17.20', numericValue: 17.2 },
        { name: 'NCP - III', value: '14.00', numericValue: 14 },
      ],
    },
    {
      subjectCode: 'QBM',
      subject_code: 'QBM',
      name: 'Quantitative Business Methods',
      units: '4',
      total: 48.5,
      max_total: 60,
      components: [
        { name: 'CP - I', value: '4.50', numericValue: 4.5 },
        { name: 'CP - II', value: '5.00', numericValue: 5 },
        { name: 'NCP - I', value: '14.00', numericValue: 14 },
        { name: 'NCP - II', value: '12.00', numericValue: 12 },
        { name: 'NCP - III', value: '13.00', numericValue: 13 },
      ],
    },
    {
      subjectCode: 'CCFA',
      subject_code: 'CCFA',
      name: 'Corporate & Cost Financial Analysis',
      units: '4',
      total: 33.0,
      max_total: 60,
      components: [
        { name: 'CP - I', value: '3.00', numericValue: 3 },
        { name: 'CP - II', value: '4.00', numericValue: 4 },
        { name: 'NCP - I', value: '10.00', numericValue: 10 },
        { name: 'NCP - II', value: '8.00', numericValue: 8 },
        { name: 'NCP - III', value: '8.00', numericValue: 8 },
      ],
    },
    {
      subjectCode: 'OB',
      subject_code: 'OB',
      name: 'Organizational Behaviour',
      units: '4',
      total: 45.8,
      max_total: 60,
      components: [
        { name: 'CP - I', value: '5.00', numericValue: 5 },
        { name: 'CP - II', value: '4.80', numericValue: 4.8 },
        { name: 'NCP - I', value: '13.00', numericValue: 13 },
        { name: 'NCP - II', value: '11.00', numericValue: 11 },
        { name: 'NCP - III', value: '12.00', numericValue: 12 },
      ],
    },
    {
      subjectCode: 'IMIL',
      subject_code: 'IMIL',
      name: 'Indian Macro & Intl. Linkages',
      units: '3',
      total: 28.0,
      max_total: 60,
      components: [
        { name: 'CP - I', value: '3.00', numericValue: 3 },
        { name: 'CP - II', value: '3.50', numericValue: 3.5 },
        { name: 'NCP - I', value: '8.00', numericValue: 8 },
        { name: 'NCP - II', value: '7.50', numericValue: 7.5 },
        { name: 'NCP - III', value: '6.00', numericValue: 6 },
      ],
    },
    {
      subjectCode: 'ISMM',
      subject_code: 'ISMM',
      name: 'Info Systems & Mgmt of Marketing',
      units: '4',
      total: 41.0,
      max_total: 60,
      components: [
        { name: 'CP - I', value: '4.00', numericValue: 4 },
        { name: 'CP - II', value: '4.50', numericValue: 4.5 },
        { name: 'NCP - I', value: '12.50', numericValue: 12.5 },
        { name: 'NCP - II', value: '10.00', numericValue: 10 },
        { name: 'NCP - III', value: '10.00', numericValue: 10 },
      ],
    },
  ],
}

export const DEMO_HISTORY = {
  // Pre-loaded history for recent dates
  '2026-06-09': [
    { date: '2026-06-09', attended: true, subject: 'FM', subject_abbr: 'FM', code: 'FM', status: 'Present' },
    { date: '2026-06-09', attended: true, subject: 'QBM', subject_abbr: 'QBM', code: 'QBM', status: 'Present' },
    { date: '2026-06-09', attended: false, subject: 'CCFA', subject_abbr: 'CCFA', code: 'CCFA', status: 'Absent' },
    { date: '2026-06-09', attended: true, subject: 'OB', subject_abbr: 'OB', code: 'OB', status: 'Present' },
  ],
  '2026-06-08': [
    { date: '2026-06-08', attended: true, subject: 'IMIL', subject_abbr: 'IMIL', code: 'IMIL', status: 'Present' },
    { date: '2026-06-08', attended: true, subject: 'ISMM', subject_abbr: 'ISMM', code: 'ISMM', status: 'Present' },
    { date: '2026-06-08', attended: true, subject: 'FM', subject_abbr: 'FM', code: 'FM', status: 'Present' },
  ],
  '2026-06-07': [
    { date: '2026-06-07', attended: true, subject: 'QBM', subject_abbr: 'QBM', code: 'QBM', status: 'Present' },
    { date: '2026-06-07', attended: true, subject: 'OB', subject_abbr: 'OB', code: 'OB', status: 'Present' },
    { date: '2026-06-07', attended: true, subject: 'CCFA', subject_abbr: 'CCFA', code: 'CCFA', status: 'Present' },
  ],
  '2026-06-06': [
    { date: '2026-06-06', attended: true, subject: 'FM', subject_abbr: 'FM', code: 'FM', status: 'Present' },
    { date: '2026-06-06', attended: false, subject: 'IMIL', subject_abbr: 'IMIL', code: 'IMIL', status: 'Absent' },
    { date: '2026-06-06', attended: true, subject: 'ISMM', subject_abbr: 'ISMM', code: 'ISMM', status: 'Present' },
  ],
}

/**
 * Build the full demo session payload (same shape as login response).
 */
export function buildDemoSession() {
  return {
    id: DEMO_USER.id,
    name: DEMO_USER.name,
    portalName: DEMO_USER.portalName,
    email: DEMO_USER.email,
    rollNumber: DEMO_USER.rollNumber,
    authProvider: 'demo',
    token: DEMO_SESSION.token,
    semesters: DEMO_SESSION.semesters,
    selectedSemester: DEMO_SESSION.selectedSemester,
    attendanceData: DEMO_ATTENDANCE,
  }
}
