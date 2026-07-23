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
  pacman: {
    slug: 'pacman',
    title: 'Maze Munch',
    description: 'Eat all dots and avoid the ghosts!',
    thumbnail: '/assets/arcade/pacman-thumb.webp',
    maxScore: 5000,
    component: lazy(() => import('./games/PacmanGame')),
  },
  // Future games added here
}

export default gameRegistry
