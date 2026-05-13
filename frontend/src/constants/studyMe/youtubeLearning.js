export const STUDYME_YOUTUBE_LESSONS = [
  {
    subjectId: 'qbm',
    lessonId: 'qbm-04',
    title: 'Transportation Problem',
    description: 'Watch short concept videos for each transportation method and scenario.',
    methods: [
      {
        id: 'nwcm',
        title: 'Balanced',
        variants: [
          {
            id: 'nwcm-balanced',
            label: 'NWCM ; LCM ; VAM',
            url: 'https://www.youtube.com/watch?v=ItOuvM2KmD4&list=PLabr9RWfBcnqy9bzlLlp71FD7RjJHNiOg&index=1',
          },
        ],
      },
      {
        id: 'lcm',
        title: 'Unbalanced',
        variants: [
          {
            id: 'lcm-balanced',
            label: 'NWCM ; LCM ; VAM',
            url: 'https://www.youtube.com/watch?v=KVGEXbmvsfk&list=PLabr9RWfBcnqy9bzlLlp71FD7RjJHNiOg&index=2',
          },
        ],
      },
    ],
  },
  {
    subjectId: 'qbm',
    lessonId: 'qbm-05',
    title: 'Assignment Problem',
    description: 'Watch concept videos for Assignment Problem methods and solving techniques.',
    methods: [
      {
        id: 'Hungarian Algorithm',
        title: 'Assignment Problem',
        variants: [
          {
            id: 'Hungarian Algorithm',
            label: 'Hungarian Algorithm',
            url: 'https://youtu.be/rrfFTdO2Z7I?si=RiYd1tQTWg_SbL0e&t=85',
          },
        ],
      },
    ],
  },//
  {
    subjectId: 'qbm',
    lessonId: 'qbm-07',
    title: 'Queuing Models',
    description: 'Watch concept videos for Queuing Models.',
    methods: [
      {
        id: 'Characteristics of waiting line',
        title: 'Characteristics of waiting line',
        variants: [
          {
            id: 'Characteristics of waiting line',
            label: 'Characteristics of waiting line',
            url: ' https://www.youtube.com/watch?v=2fSG2Ugo85E&t=414s',
          },
        ],
      },
      {
        id: 'Queuing Models',
        title: 'Queuing Models',
        variants: [
          {
            id: 'Queuing Models',
            label: 'Queuing Models',
            url: 'https://www.youtube.com/watch?v=xlenI95G0eI',
          },
        ],
      },
    ],
  },//

]

export function getLessonYoutubeLearning(subjectId, lessonId) {
  return STUDYME_YOUTUBE_LESSONS.find((item) => item.subjectId === subjectId && item.lessonId === lessonId) || null
}

export function hasLessonYoutubeLearning(subjectId, lessonId) {
  return Boolean(getLessonYoutubeLearning(subjectId, lessonId))
}
