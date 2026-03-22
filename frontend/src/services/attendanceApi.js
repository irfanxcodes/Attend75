import { attendanceSeedData, userSeedData } from '../constants/dummyData'

function withDelay(callback, duration = 1300) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(callback())
      } catch (error) {
        reject(error)
      }
    }, duration)
  })
}

export function login(credentials) {
  return withDelay(() => {
    const username = credentials?.username?.trim()
    const password = credentials?.password?.trim()

    if (!username || !password) {
      throw new Error('Enter both username and password to continue.')
    }

    if (username.toLowerCase() === 'fail') {
      throw new Error('Login failed. Please check your credentials and try again.')
    }

    return {
      name: username,
      id: userSeedData.id,
      token: 'mock-session-token',
    }
  })
}

export function fetchAttendance() {
  return withDelay(() => {
    if (Math.random() < 0.15) {
      throw new Error('Unable to load attendance right now. Please retry.')
    }

    return {
      ...attendanceSeedData,
      subjects: attendanceSeedData.subjects.map((subject) => ({ ...subject })),
      history: attendanceSeedData.history.map((entry) => ({ ...entry })),
    }
  }, 1500)
}
