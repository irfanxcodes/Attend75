import { lazy } from 'react'

const gameRegistry = {
  flappy: {
    slug: 'flappy',
    title: 'Flappy Bird',
    description: 'Tap to fly through pipes!',
    thumbnail: '/assets/arcade/flappy-thumb.webp',
    maxScore: 999,
    component: lazy(() => import('./games/FlappyGame')),
  },
  // Future games added here
}

export default gameRegistry
